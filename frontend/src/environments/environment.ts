export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window as any).__FITNOVA_API_URL__) || '/api',
};

