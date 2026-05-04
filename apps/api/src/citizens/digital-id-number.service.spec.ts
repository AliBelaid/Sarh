import { DigitalIdNumberService } from './digital-id-number.service';

describe('DigitalIdNumberService — pure helpers', () => {
  describe('parse()', () => {
    it('parses a well-formed Tripoli ID', () => {
      const parts = DigitalIdNumberService.parse('LY-11-2026-000147-3');
      expect(parts).toEqual({ region: '11', year: 2026, serial: 147, check: 3 });
    });

    it('parses a Sabha ID with a different region', () => {
      const parts = DigitalIdNumberService.parse('LY-31-2025-000001-7');
      expect(parts).toEqual({ region: '31', year: 2025, serial: 1, check: 7 });
    });

    it('rejects missing country prefix', () => {
      expect(DigitalIdNumberService.parse('11-2026-000147-3')).toBeNull();
    });

    it('rejects wrong country code', () => {
      expect(DigitalIdNumberService.parse('LB-11-2026-000147-3')).toBeNull();
    });

    it('rejects malformed serial length', () => {
      expect(DigitalIdNumberService.parse('LY-11-2026-147-3')).toBeNull();
    });

    it('rejects letters in numeric segments', () => {
      expect(DigitalIdNumberService.parse('LY-11-2026-00X147-3')).toBeNull();
    });

    it('rejects multi-digit check', () => {
      expect(DigitalIdNumberService.parse('LY-11-2026-000147-31')).toBeNull();
    });
  });

  describe('format() round-trips parse()', () => {
    it.each([
      'LY-11-2026-000147-3',
      'LY-21-2026-000001-0',
      'LY-31-2025-999999-9',
    ])('round-trips %s', (id) => {
      const parts = DigitalIdNumberService.parse(id)!;
      expect(DigitalIdNumberService.format(parts)).toBe(id);
    });
  });

  describe('computeLuhn() — standard Luhn over region+year+serial', () => {
    // Worked example: region=11, year=2026, serial=000147
    //   payload   = "11" + "2026" + "000147" = "112026000147"
    //   When computing a NEW check digit, the check digit will land at
    //   position 1 of the future number, so position 2 of the future
    //   number is position 1 of the payload — meaning we double the
    //   rightmost payload digit.
    //   From the right of payload (1-indexed), double odd positions:
    //     pos 1 "7" -> 14 -> 5
    //     pos 2 "4" -> 4
    //     pos 3 "1" -> 2
    //     pos 4 "0" -> 0
    //     pos 5 "0" -> 0
    //     pos 6 "0" -> 0
    //     pos 7 "6" -> 12 -> 3
    //     pos 8 "2" -> 2
    //     pos 9 "0" -> 0
    //     pos 10 "2" -> 2
    //     pos 11 "1" -> 2
    //     pos 12 "1" -> 1
    //   sum = 5+4+2+0+0+0+3+2+0+2+2+1 = 21
    //   check = (10 - 21%10) % 10 = 9
    it('computes 9 for Tripoli/2026/serial 147', () => {
      expect(
        DigitalIdNumberService.computeLuhn({ region: '11', year: 2026, serial: 147 }),
      ).toBe(9);
    });

    it('produces a single digit 0..9 for any valid input', () => {
      for (const region of ['11', '21', '31']) {
        for (let serial = 0; serial < 50; serial++) {
          const c = DigitalIdNumberService.computeLuhn({ region, year: 2026, serial });
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(9);
        }
      }
    });

    it('changes when the serial increments by one', () => {
      const a = DigitalIdNumberService.computeLuhn({ region: '11', year: 2026, serial: 100 });
      const b = DigitalIdNumberService.computeLuhn({ region: '11', year: 2026, serial: 101 });
      expect(a).not.toBe(b);
    });

    it('changes when the region prefix changes', () => {
      const tripoli = DigitalIdNumberService.computeLuhn({ region: '11', year: 2026, serial: 1 });
      const benghazi = DigitalIdNumberService.computeLuhn({ region: '21', year: 2026, serial: 1 });
      expect(tripoli).not.toBe(benghazi);
    });
  });

  describe('isValid()', () => {
    it('accepts a properly check-digited ID', () => {
      const parts = { region: '11', year: 2026, serial: 147 } as const;
      const check = DigitalIdNumberService.computeLuhn(parts);
      const id = DigitalIdNumberService.format({ ...parts, check });
      expect(DigitalIdNumberService.isValid(id)).toBe(true);
    });

    it('rejects an ID with a tampered check digit', () => {
      const parts = { region: '11', year: 2026, serial: 147 } as const;
      const check = DigitalIdNumberService.computeLuhn(parts);
      const tampered = DigitalIdNumberService.format({ ...parts, check: (check + 1) % 10 });
      expect(DigitalIdNumberService.isValid(tampered)).toBe(false);
    });

    it('rejects garbage', () => {
      expect(DigitalIdNumberService.isValid('not-an-id')).toBe(false);
      expect(DigitalIdNumberService.isValid('')).toBe(false);
    });
  });
});

describe('DigitalIdNumberService — next() integration', () => {
  // Mocks the Supabase RPC to verify the service:
  // 1) calls generate_digital_id with the right arguments,
  // 2) re-stamps the check digit using real Luhn (overriding the SQL).
  function makeServiceWithRpcReturning(rpcReturn: unknown) {
    const rpcMock = jest.fn().mockResolvedValue({ data: rpcReturn, error: null });
    const supabase = { admin: { rpc: rpcMock } } as unknown as ConstructorParameters<
      typeof DigitalIdNumberService
    >[0];
    return { service: new DigitalIdNumberService(supabase), rpcMock };
  }

  it('passes region + year through to the SQL function', async () => {
    const { service, rpcMock } = makeServiceWithRpcReturning('LY-11-2026-000147-8');
    await service.next('11', 2026);
    expect(rpcMock).toHaveBeenCalledWith('generate_digital_id', {
      p_region_code: '11',
      p_year: 2026,
    });
  });

  it('overrides the SQL check digit with real Luhn', async () => {
    // SQL stub returns check = 8; service must re-stamp it to 9
    // (see "Worked example" comment above for the calculation).
    const { service } = makeServiceWithRpcReturning('LY-11-2026-000147-8');
    const id = await service.next('11', 2026);
    expect(id).toBe('LY-11-2026-000147-9');
    expect(DigitalIdNumberService.isValid(id)).toBe(true);
  });

  it('rejects bad region codes before calling RPC', async () => {
    const { service, rpcMock } = makeServiceWithRpcReturning('ignored');
    await expect(service.next('1', 2026)).rejects.toThrow();
    await expect(service.next('AB', 2026)).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects out-of-range years', async () => {
    const { service } = makeServiceWithRpcReturning('ignored');
    await expect(service.next('11', 1990)).rejects.toThrow();
    await expect(service.next('11', 2101)).rejects.toThrow();
  });
});
