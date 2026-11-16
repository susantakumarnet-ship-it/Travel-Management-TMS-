import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import dashboard from './dashboard.js';
import catalog from './catalog.js';
import people from './people.js';
import operations from './operations.js';
import finance from './finance.js';
import content from './content.js';
import reports from './reports.js';

const r = Router();
r.use(requireAuth, requireRole('ADMIN'));
r.use('/dashboard', dashboard);
r.use('/reports', reports);
r.use(catalog);
r.use(people);
r.use(operations);
r.use(finance);
r.use(content);

export default r;
