import { Injectable, Logger } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SignInDto } from './dto/sign-in.dto';
import { InviteOfficerDto } from './dto/invite-officer.dto';
import { JwtService, SijilliJwtPayload } from './jwt.service';

export interface SignInResult {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: {
    id: string;
    email: string | null;
    role: string | null;
    officer_id: string | null;
    citizen_id: string | null;
  };
}

export interface InvitedOfficer {
  id: string;
  auth_user_id: string;
  email: string;
  employee_no: string;
  role: string;
  full_name_ar: string;
  recovery_token: string; // one-shot password reset token
}

interface AuthUserRow {
  id: string;
  email: string;
  encrypted_password: string;
  email_confirmed_at: Date | null;
  raw_app_meta_data: Record<string, unknown>;
  raw_user_meta_data: Record<string, unknown>;
}

const BCRYPT_COST = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwt: JwtService,
  ) {}

  // ---------------- Sign in ------------------------------------------
  async signIn(dto: SignInDto): Promise<SignInResult> {
    const lookup = await this.supabase.admin
      .from<AuthUserRow>('auth_users')
      .select('id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();
    if (lookup.error) throw SijilliErrors.upstream(lookup.error.message);
    if (!lookup.data) throw SijilliErrors.unauthorized();

    const user = lookup.data;
    const ok = await bcrypt.compare(dto.password, user.encrypted_password);
    if (!ok) throw SijilliErrors.unauthorized();

    // Resolve officer / citizen ids for the response and the JWT.
    const officer = await this.supabase.admin
      .from<{ id: string; role: string; region_id: number | null; municipality_id: number | null; permissions: Record<string, unknown> | null; is_active: boolean }>('officers')
      .select('id, role, region_id, municipality_id, permissions, is_active')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const appMeta = user.raw_app_meta_data ?? {};
    const role =
      (officer.data?.is_active ? officer.data.role : null) ??
      (appMeta['sijilli_role'] as string | undefined) ??
      null;
    const citizenId = (appMeta['citizen_id'] as string | undefined) ?? null;

    if (!role) throw SijilliErrors.unauthorized();

    const payload: SijilliJwtPayload = {
      sub: user.id,
      email: user.email,
      sijilli_role: role,
      citizen_id: citizenId ?? undefined,
      officer_id: officer.data?.id,
      region_id: officer.data?.region_id ?? null,
      municipality_id: officer.data?.municipality_id ?? null,
      permissions: (officer.data?.permissions as Record<string, boolean | string | number> | null) ?? null,
    };

    const { token, expiresIn } = this.jwt.signAccessToken(payload);
    const refresh = randomBytes(48).toString('base64url');

    // Stamp last_sign_in_at (best-effort, ignore errors).
    await this.supabase.admin
      .from('auth_users')
      .update({ last_sign_in_at: new Date().toISOString() })
      .eq('id', user.id);

    return {
      access_token: token,
      refresh_token: refresh,
      token_type: 'bearer',
      expires_in: expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role,
        officer_id: officer.data?.id ?? null,
        citizen_id: citizenId,
      },
    };
  }

  // ---------------- Invite officer -----------------------------------
  async inviteOfficer(dto: InviteOfficerDto): Promise<InvitedOfficer> {
    const authUserId = randomUUID();
    // Random initial password — caller emails the recovery_token.
    const tempPwd = randomBytes(24).toString('base64url');
    const hash = await bcrypt.hash(tempPwd, BCRYPT_COST);

    const created = await this.supabase.admin
      .from<AuthUserRow>('auth_users')
      .insert({
        id: authUserId,
        email: dto.email.toLowerCase(),
        encrypted_password: hash,
        email_confirmed_at: new Date().toISOString(),
        raw_app_meta_data: {
          sijilli_role: dto.role,
          permissions: dto.permissions ?? {},
        },
        raw_user_meta_data: {
          full_name_ar: dto.full_name_ar,
        },
      })
      .select('id, email')
      .single();
    if (created.error || !created.data) {
      if (created.error?.code === '23505') {
        throw SijilliErrors.conflict(
          'البريد الإلكتروني مستخدم مسبقاً.',
          'Email already exists.',
        );
      }
      throw SijilliErrors.upstream(`Failed to create auth user: ${created.error?.message ?? 'unknown'}`);
    }

    const inserted = await this.supabase.admin
      .from<{ id: string; auth_user_id: string; email: string; employee_no: string; role: string; full_name_ar: string }>('officers')
      .insert({
        auth_user_id: authUserId,
        employee_no: dto.employee_no,
        full_name_ar: dto.full_name_ar,
        full_name_en: dto.full_name_en ?? null,
        role: dto.role,
        region_id: dto.region_id ?? null,
        municipality_id: dto.municipality_id ?? null,
        phone: dto.phone ?? null,
        email: dto.email.toLowerCase(),
        permissions: dto.permissions ?? {},
        is_active: true,
      })
      .select('id, auth_user_id, email, employee_no, role, full_name_ar')
      .single();

    if (inserted.error || !inserted.data) {
      // Roll back the auth user so we don't orphan it.
      await this.supabase.admin.from('auth_users').delete().eq('id', authUserId);
      if (inserted.error?.code === '23505') {
        throw SijilliErrors.conflict(
          'الرقم الوظيفي أو البريد الإلكتروني مستخدم مسبقاً.',
          'Employee number or email already exists.',
        );
      }
      throw SijilliErrors.upstream(`Failed to insert officer: ${inserted.error?.message ?? 'unknown'}`);
    }

    return {
      id: inserted.data.id,
      auth_user_id: inserted.data.auth_user_id,
      email: inserted.data.email,
      employee_no: inserted.data.employee_no,
      role: inserted.data.role,
      full_name_ar: inserted.data.full_name_ar,
      recovery_token: tempPwd,
    };
  }
}
