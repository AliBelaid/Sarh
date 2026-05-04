import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { Property } from '@sijilli/shared-types';

export const PropertiesActions = createActionGroup({
  source: 'Properties',
  events: {
    Load: props<{ status?: string; regionId?: number }>(),
    'Load Success': props<{ items: Property[] }>(),
    'Load Failure': props<{ messageAr: string }>(),

    Upsert: props<{ property: Property }>(),

    Review: props<{
      id: string;
      decision: 'approve' | 'reject' | 'needs_clarification';
      note?: string;
      approvalDecreeNo?: string;
    }>(),
    'Review Success': props<{ id: string; status: string }>(),
    'Review Failure': props<{ id: string; messageAr: string }>(),

    Clear: emptyProps(),
  },
});
