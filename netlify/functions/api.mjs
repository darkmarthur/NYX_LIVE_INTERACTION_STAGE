import { createApp } from '../../server/app.mjs';
import { withErrorDiagnostics } from '../../server/diagnostics.mjs';
export default withErrorDiagnostics(createApp());
export const config = { path: '/api/*' };
