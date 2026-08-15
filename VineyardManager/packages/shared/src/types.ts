import type {
  ACTIVITY_SCOPES,
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  HARVEST_CONDITIONS,
  HEALTH_COLORS,
  TASK_STATUSES,
  TASK_TYPES,
  USER_ROLES,
  BLOCK_STATUSES,
  VINE_STATUSES,
  WATERING_METHODS,
} from "./constants.js";

export type UserRole = (typeof USER_ROLES)[number];
export type VineStatus = (typeof VINE_STATUSES)[number];
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
export type HealthColor = (typeof HEALTH_COLORS)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type WateringMethod = (typeof WATERING_METHODS)[number];
export type HarvestCondition = (typeof HARVEST_CONDITIONS)[number];

export interface Audited {
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface User extends Audited {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  notificationPrefs: NotificationPrefs;
}

export interface NotificationPrefs {
  emailEnabled: boolean;
  pushEnabled: boolean;
  frequency: "weekly" | "as_needed" | "daily";
}

export interface HealthThresholds {
  greenMin: number;
  yellowMin: number;
  orangeMin: number;
}

export interface Vineyard extends Audited {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  timezone: string;
  healthThresholds: HealthThresholds;
}

export interface Block extends Audited {
  id: string;
  vineyardId: string;
  code: string;
  name: string;
  variety: string;
  acreage: number;
  plantedYear: number;
  status: BlockStatus;
  notes?: string | null;
}

export interface VarietyCharacteristics {
  waterNeeds?: string;
  pruningWindow?: string;
  pestSusceptibility?: string[];
  typicalHarvestMonth?: number;
}

export interface Variety extends Audited {
  id: string;
  vineyardId: string;
  name: string;
  source: "manual" | "auto_lookup";
  characteristics: VarietyCharacteristics;
}

export interface Row extends Audited {
  id: string;
  vineyardId: string;
  blockId?: string | null;
  code: string;
  label?: string | null;
  vineCount: number;
  spacingFt: number;
  orientation?: string | null;
  varietyId?: string | null;
  sortOrder: number;
}

export interface Vine extends Audited {
  id: string;
  rowId: string;
  position: number;
  varietyId: string;
  plantedAt?: string | null;
  status: VineStatus;
  notes?: string | null;
}

export interface Activity extends Audited {
  id: string;
  vineyardId: string;
  scopeType: ActivityScope;
  scopeId: string;
  activityType: ActivityType;
  performedAt: string;
  performedBy: string;
  details: ActivityDetails;
  source: ActivitySource;
}

export type ActivityDetails =
  | WateringDetails
  | FertilizationDetails
  | PestPreventionDetails
  | WeedPreventionDetails
  | HarvestDetails
  | ObservationDetails
  | Record<string, unknown>;

export interface WateringDetails {
  durationMin: number;
  method: WateringMethod;
  volumeGal?: number;
}

export interface FertilizationDetails {
  product: string;
  amountPerVine: number;
  unit: string;
}

export interface PestPreventionDetails {
  method: "spray" | "dust" | "proximity";
  targetPests: string[];
  product?: string;
  amountPerVine?: number;
}

export interface WeedPreventionDetails {
  method: "spray" | "dust" | "manual";
  product?: string;
}

export interface HarvestDetails {
  weightLb: number;
  condition: HarvestCondition;
}

export interface ObservationDetails {
  pests: string[];
  damage: string[];
  notes: string;
}

export interface HealthSnapshot {
  id: string;
  vineyardId?: string | null;
  blockId?: string | null;
  rowId?: string | null;
  vineId?: string | null;
  score: number;
  color: HealthColor;
  reasons: HealthReason[];
  calculatedAt: string;
  calculatedBy: "rule_engine" | "ai_assistant";
}

export interface HealthReason {
  code: string;
  message: string;
  severity: HealthColor;
}

export interface ScheduledTask extends Audited {
  id: string;
  vineyardId: string;
  blockId?: string | null;
  userId?: string | null;
  type: TaskType;
  title: string;
  body: string;
  dueAt: string;
  status: TaskStatus;
  relatedActivityType?: ActivityType | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
