import { Router } from 'express';
import { DocumentsController } from './documents.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/documents?category=training|policy — any logged-in user
router.get('/', DocumentsController.list);

// GET /api/v1/documents/:id/file — view (inline) or download (?download=1); any logged-in user
router.get('/:id/file', DocumentsController.getFile);

// POST /api/v1/documents — SuperAdmin only (accepts up to 10 files per request)
router.post('/', requireRole('SuperAdmin'), DocumentsController.uploadMiddleware, DocumentsController.create);

// DELETE /api/v1/documents/:id — SuperAdmin only
router.delete('/:id', requireRole('SuperAdmin'), DocumentsController.remove);

export default router;
