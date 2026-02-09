export interface Response<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export function success<T>(data?: T): Response<T> {
  return { success: true, data };
}

export function error(message: string): Response {
  return { success: false, message };
}
