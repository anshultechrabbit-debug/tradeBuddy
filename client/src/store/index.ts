import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import portfolioReducer from './portfolioSlice';
import radarReducer from './radarSlice';
import watchlistReducer from './watchlistSlice';
import alertsReducer from './alertsSlice';
import journalReducer from './journalSlice';
import settingsReducer from './settingsSlice';
import adminReducer from './adminSlice';
import marketReducer from './marketSlice';
import aiReducer from './aiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    portfolio: portfolioReducer,
    radar: radarReducer,
    watchlist: watchlistReducer,
    alerts: alertsReducer,
    journal: journalReducer,
    settings: settingsReducer,
    admin: adminReducer,
    market: marketReducer,
    ai: aiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;