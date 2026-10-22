import { request } from '../../shared/api';

export const feedbackApi = {
  mySubmissions: () => request<{ session_id: string }[]>('/api/feedback/my-submissions'),
  submit: (sessionId: string, answers: Record<string, string>) =>
    request<{ ok: boolean }>('/api/feedback/submit', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answers }),
    }),
};
