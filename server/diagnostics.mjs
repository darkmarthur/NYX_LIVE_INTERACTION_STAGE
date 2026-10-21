// Log only a failure category/status, never request data, cookies or secrets.
export function withErrorDiagnostics(handler) {
  return async (request, context) => {
    const response = await handler(request, context);
    if (!response.ok) {
      let code = 'UNKNOWN';
      try {
        const body = await response.clone().json();
        if (typeof body?.error?.code === 'string' && /^[A-Z_0-9]{1,40}$/.test(body.error.code)) code = body.error.code;
      } catch { /* A platform response may not be JSON. */ }
      console.warn(JSON.stringify({ event:'nyx_request_error', code, status:response.status }));
    }
    return response;
  };
}
