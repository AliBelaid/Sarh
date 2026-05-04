import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SijilliRequestUser } from '../auth/types';
import { CreateCitizenDto } from './dto/create-citizen.dto';
import { UpdateCitizenDto } from './dto/update-citizen.dto';
import { ListCitizensQuery } from './dto/list-citizens.dto';

const SELECT_COLS = `
  id,
  first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar,
  first_name_en, father_name_en, grandfather_name_en, family_name_en,
  mother_name_ar,
  legacy_national_no, family_book_no,
  gender, birth_date, birth_place, nationality, marital_status,
  phone, email,
  region_id, municipality_id, address_ar,
  photo_path, signature_path,
  is_active, created_at, updated_at
`;

@Injectable()
export class CitizensService {
  private readonly logger = new Logger(CitizensService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // ----------------------------------------------------------------------
  // Create — officer-only.
  // ----------------------------------------------------------------------
  async create(dto: CreateCitizenDto, actor: SijilliRequestUser) {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    const { data, error } = await this.supabase.admin
      .from('citizens')
      .insert({
        first_name_ar: dto.first_name_ar,
        father_name_ar: dto.father_name_ar,
        grandfather_name_ar: dto.grandfather_name_ar,
        family_name_ar: dto.family_name_ar,
        first_name_en: dto.first_name_en ?? null,
        father_name_en: dto.father_name_en ?? null,
        grandfather_name_en: dto.grandfather_name_en ?? null,
        family_name_en: dto.family_name_en ?? null,
        mother_name_ar: dto.mother_name_ar ?? null,
        legacy_national_no: dto.legacy_national_no ?? null,
        family_book_no: dto.family_book_no ?? null,
        gender: dto.gender,
        birth_date: dto.birth_date,
        birth_place: dto.birth_place ?? null,
        marital_status: dto.marital_status ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        region_id: dto.region_id,
        municipality_id: dto.municipality_id ?? null,
        address_ar: dto.address_ar ?? null,
        photo_path: dto.photo_path ?? null,
        signature_path: dto.signature_path ?? null,
        created_by: actor.officer_id,
        is_active: true,
      })
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw SijilliErrors.conflict(
          'يوجد مواطن مسجّل مسبقاً برقم وطني أو هاتف أو بريد إلكتروني مماثل.',
          'A citizen already exists with the same national/phone/email.',
        );
      }
      throw SijilliErrors.upstream(`Failed to insert citizen: ${error?.message ?? 'unknown'}`);
    }

    return data;
  }

  // ----------------------------------------------------------------------
  // List — officers see their region + (super_admin) see all.
  // Cursor pagination on created_at DESC.
  // ----------------------------------------------------------------------
  async list(q: ListCitizensQuery, actor: SijilliRequestUser) {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    let query = this.supabase.admin
      .from('citizens')
      .select(SELECT_COLS)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(q.limit + 1); // fetch one extra to derive next_cursor

    // Region scoping for non-super-admin roles.
    if (actor.role !== 'super_admin' && actor.role !== 'auditor') {
      if (q.region_id !== undefined && actor.region_id !== null && q.region_id !== actor.region_id) {
        throw SijilliErrors.forbidden('لا يمكنك عرض مواطنين من خارج منطقتك.');
      }
      if (actor.region_id) {
        query = query.eq('region_id', actor.region_id);
      }
    } else if (q.region_id !== undefined) {
      query = query.eq('region_id', q.region_id);
    }

    if (q.cursor) {
      query = query.lt('created_at', q.cursor);
    }

    if (q.q && q.q.trim().length >= 2) {
      // Use ilike on the concatenated name (the schema has a trigram GIN
      // index on this expression — see 003_citizens.sql).
      const safe = q.q.replace(/[%_]/g, '\\$&').trim();
      query = query.or(
        `first_name_ar.ilike.%${safe}%,family_name_ar.ilike.%${safe}%,father_name_ar.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw SijilliErrors.upstream(`Failed to list citizens: ${error.message}`);
    }

    const items = data ?? [];
    let next_cursor: string | null = null;
    if (items.length > q.limit) {
      const overflow = items.pop()!;
      next_cursor = overflow.created_at as string;
    }
    return { items, next_cursor };
  }

  // ----------------------------------------------------------------------
  // Get by id — officers can read any; a citizen can read themselves.
  // ----------------------------------------------------------------------
  async getById(id: string, actor: SijilliRequestUser) {
    if (actor.role === 'citizen' && actor.citizen_id !== id) {
      throw SijilliErrors.forbidden();
    }
    const { data, error } = await this.supabase.admin
      .from('citizens')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw SijilliErrors.upstream(`Failed to load citizen: ${error.message}`);
    if (!data) throw SijilliErrors.notFound('المواطن');
    return data;
  }

  // ----------------------------------------------------------------------
  // Update — officer-only.
  // ----------------------------------------------------------------------
  async update(id: string, dto: UpdateCitizenDto, actor: SijilliRequestUser) {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    const before = await this.supabase.admin
      .from('citizens')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();

    if (before.error) throw SijilliErrors.upstream(before.error.message);
    if (!before.data) throw SijilliErrors.notFound('المواطن');

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) patch[k] = v;
    }

    if (Object.keys(patch).length === 0) {
      return before.data;
    }

    const { data, error } = await this.supabase.admin
      .from('citizens')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      throw SijilliErrors.upstream(`Failed to update citizen: ${error?.message ?? 'unknown'}`);
    }
    return data;
  }
}
