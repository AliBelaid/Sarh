import { createFeature, createReducer, on } from '@ngrx/store';
import type { Property } from '@sijilli/shared-types';
import { PropertiesActions } from './properties.actions';

export const PROPERTIES_FEATURE_KEY = 'properties';

export interface PropertiesState {
  items: Property[];
  loading: boolean;
  error: string | null;
  reviewBusyId: string | null;
}

export const initialState: PropertiesState = {
  items: [],
  loading: false,
  error: null,
  reviewBusyId: null,
};

export const propertiesReducer = createReducer(
  initialState,
  on(PropertiesActions.load, (state) => ({ ...state, loading: true, error: null })),
  on(PropertiesActions.loadSuccess, (state, { items }) => ({
    ...state,
    loading: false,
    items,
  })),
  on(PropertiesActions.loadFailure, (state, { messageAr }) => ({
    ...state,
    loading: false,
    error: messageAr,
  })),
  on(PropertiesActions.upsert, (state, { property }) => {
    const next = [...state.items];
    const idx = next.findIndex((p) => p.id === property.id);
    if (idx >= 0) next[idx] = property;
    else next.unshift(property);
    return { ...state, items: next };
  }),
  on(PropertiesActions.review, (state, { id }) => ({ ...state, reviewBusyId: id })),
  on(PropertiesActions.reviewSuccess, (state, { id, status }) => ({
    ...state,
    reviewBusyId: state.reviewBusyId === id ? null : state.reviewBusyId,
    items: state.items.map((p) =>
      p.id === id ? { ...p, status: status as Property['status'] } : p,
    ),
  })),
  on(PropertiesActions.reviewFailure, (state, { id, messageAr }) => ({
    ...state,
    reviewBusyId: state.reviewBusyId === id ? null : state.reviewBusyId,
    error: messageAr,
  })),
  on(PropertiesActions.clear, () => initialState),
);

// createFeature gives us auto-generated selectors.
export const propertiesFeature = createFeature({
  name: PROPERTIES_FEATURE_KEY,
  reducer: propertiesReducer,
});

export const {
  selectItems: selectPropertiesItems,
  selectLoading: selectPropertiesLoading,
  selectError: selectPropertiesError,
  selectReviewBusyId: selectPropertiesReviewBusyId,
} = propertiesFeature;
