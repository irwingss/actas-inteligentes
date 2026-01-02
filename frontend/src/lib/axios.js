import axios from 'axios';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Retry configuration for when backend is starting up (Tauri build)
const MAX_RETRIES = 5;
const RETRY_DELAY = 1500; // ms between retries

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000 // 30 second timeout
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    
    // Mark retry count
    config.__retryCount = config.__retryCount || 0;
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors and network retries
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    
    // Retry on network errors (backend not ready yet in Tauri build)
    const isNetworkError = !error.response && (
      error.code === 'ERR_NETWORK' || 
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('Network Error')
    );
    
    if (isNetworkError && config && config.__retryCount < MAX_RETRIES) {
      config.__retryCount += 1;
      console.log(`[API] Network error, retrying (${config.__retryCount}/${MAX_RETRIES})...`);
      await wait(RETRY_DELAY);
      return api(config);
    }
    
    if (error.response?.status === 401) {
      // Token expired or invalid - sign out
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
