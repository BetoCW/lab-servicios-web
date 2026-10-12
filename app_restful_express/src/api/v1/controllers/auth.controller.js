import * as AuthServices from '../services/auth.service';

// --- POST /auth/login -----------------------------------------------------
export const login = async (req, res, next) => {
  try {
    res.status(200).json(AuthServices.login(req.body));
  } catch (error) {
    next(error);
  }
};

// --- GET /auth/session ----------------------------------------------------
export const getSession = async (req, res) => {
  res.status(200).json(req.session);
};
