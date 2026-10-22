import { createMultiApp } from '../../server/multi.mjs';
import { withErrorDiagnostics } from '../../server/diagnostics.mjs';
export default withErrorDiagnostics(createMultiApp());
export const config = { path: '/api/*' };
