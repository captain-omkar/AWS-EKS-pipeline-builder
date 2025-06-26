interface AppConfig {
  API_URL: string;
}

declare global {
  interface Window {
    APP_CONFIG: AppConfig;
  }
}

export const config = {
  API_URL: window.APP_CONFIG?.API_URL || 'http://localhost:5000'
};

// Helper function to build API endpoints
export const getApiUrl = (endpoint: string): string => {
  return `${config.API_URL}${endpoint}`;
};