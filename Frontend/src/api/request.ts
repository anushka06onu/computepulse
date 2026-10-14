export async function requestJson<T>(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      let message = `The service returned HTTP ${response.status}. Please try again later.`;
      try {
        const body = await response.json();
        if (typeof body.detail === 'string') message = body.detail;
      } catch { /* Keep a clear HTTP error for non-JSON responses. */ }
      throw new Error(message);
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The backend took too long to respond. Please retry when the service is available.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
