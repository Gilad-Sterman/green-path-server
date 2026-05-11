import { Router } from 'express';
import { otpLimiter, defaultLimiter } from '../../middleware/rateLimit.js';
import * as authController from './controller.js';

const router = Router();

router.post('/send-otp',   otpLimiter,     authController.sendOtp);
router.post('/verify-otp', defaultLimiter, authController.verifyOtp);
router.post('/refresh',    defaultLimiter, authController.refresh);
router.post('/logout',     authController.logout);

export default router;
