/** Local-dev default only. Set JWT_SECRET in the environment for any real deployment. */
const DEV_JWT_SECRET = "vineyard-dev-jwt-secret-not-for-production";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
};
