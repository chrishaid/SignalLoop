import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// ============================================================================
// PASSPORT CONFIGURATION
// ============================================================================

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_CALLBACK_URL!,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Extract user information from Google profile
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('No email found in Google profile'));
    }

    // Find or create user
    // For MVP, we'll assume tenant is determined by email domain
    const domain = email.split('@')[1];

    // Find tenant by domain
    const idpConfig = await prisma.idpConfig.findFirst({
      where: {
        provider: 'GOOGLE_WORKSPACE',
        domain: domain,
        status: 'ACTIVE'
      },
      include: {
        tenant: true
      }
    });

    if (!idpConfig) {
      return done(new Error(`No active tenant found for domain: ${domain}`));
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: {
        tenantId_idpSubjectId: {
          tenantId: idpConfig.tenantId,
          idpSubjectId: profile.id
        }
      }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId: idpConfig.tenantId,
          idpSubjectId: profile.id,
          primaryEmail: email,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          displayName: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
          status: 'ACTIVE'
        }
      });
      logger.info(`New user created: ${user.id} (${email})`);
    } else {
      // Update user info if changed
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          displayName: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value
        }
      });
    }

    done(null, user);
  } catch (error) {
    logger.error('Error in Google OAuth callback', error);
    done(error as Error);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// ============================================================================
// ROUTES
// ============================================================================

// Initiate Google OAuth
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    accessType: 'offline',
    prompt: 'consent'
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    // After successful authentication, redirect to survey prompt
    // This is where we'll intercept with the survey question
    res.redirect('/survey/prompt');
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      logger.error('Logout error', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Check authentication status
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

export const authRoutes = router;
