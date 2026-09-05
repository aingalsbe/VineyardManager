import {
  inviteUserSchema,
  updateVineyardUserSchema,
} from "@vineyard/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { getAuthUser, requireSetup } from "../auth/auth.middleware.js";
import {
  inviteUser,
  listUsers,
  removeUser,
  requireVineyard,
  updateUser,
} from "./users.service.js";

export const vineyardUsersRouter = Router({ mergeParams: true });

const vineyardIdParam = z.string().uuid();
const userIdParam = z.string().uuid();

vineyardUsersRouter.use(requireSetup);

vineyardUsersRouter.get(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    await requireVineyard(vineyardId);
    const includeDeleted = req.query.includeDeleted === "1";
    const users = await listUsers(includeDeleted);
    res.json({ data: users });
  },
);

vineyardUsersRouter.post(
  "/",
  async (req: Request<{ vineyardId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    await requireVineyard(vineyardId);
    const body = inviteUserSchema.parse(req.body);
    const result = await inviteUser(body);
    res.status(201).json({ data: result });
  },
);

vineyardUsersRouter.patch(
  "/:userId",
  async (req: Request<{ vineyardId: string; userId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const userId = userIdParam.parse(req.params.userId);
    const vineyard = await requireVineyard(vineyardId);
    const body = updateVineyardUserSchema.parse(req.body);
    const user = await updateUser({
      actor: getAuthUser(req),
      vineyard,
      userId,
      role: body.role,
      disabled: body.disabled,
      displayName: body.displayName,
    });
    res.json({ data: user });
  },
);

vineyardUsersRouter.delete(
  "/:userId",
  async (req: Request<{ vineyardId: string; userId: string }>, res) => {
    const vineyardId = vineyardIdParam.parse(req.params.vineyardId);
    const userId = userIdParam.parse(req.params.userId);
    const vineyard = await requireVineyard(vineyardId);
    await removeUser({
      actor: getAuthUser(req),
      vineyard,
      userId,
    });
    res.json({ data: { ok: true } });
  },
);
