import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { surveyRoutes } from './survey.routes';
import { adminRoutes } from './admin.routes';
import { reportingRoutes } from './reporting.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/survey', surveyRoutes);
router.use('/admin', adminRoutes);
router.use('/reporting', reportingRoutes);

export const routes = router;
