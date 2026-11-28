import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";

const ActivitiesPage = lazy(() =>
  import("@/pages/ActivitiesPage").then((m) => ({ default: m.ActivitiesPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const HarvestsPage = lazy(() =>
  import("@/pages/HarvestsPage").then((m) => ({ default: m.HarvestsPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const MetricsPage = lazy(() =>
  import("@/pages/MetricsPage").then((m) => ({ default: m.MetricsPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
const PastSeasonsPage = lazy(() =>
  import("@/pages/PastSeasonsPage").then((m) => ({
    default: m.PastSeasonsPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const RowsPage = lazy(() =>
  import("@/pages/RowsPage").then((m) => ({ default: m.RowsPage })),
);
const SeasonDetailPage = lazy(() =>
  import("@/pages/SeasonDetailPage").then((m) => ({
    default: m.SeasonDetailPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SetupPage = lazy(() =>
  import("@/pages/SetupPage").then((m) => ({ default: m.SetupPage })),
);
const TasksPage = lazy(() =>
  import("@/pages/TasksPage").then((m) => ({ default: m.TasksPage })),
);

function RouteFallback() {
  return (
    <div
      className="flex min-h-48 items-center justify-center text-sm text-muted"
      aria-busy="true"
    >
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="rows" element={<RowsPage />} />
          <Route path="blocks" element={<Navigate to="/rows" replace />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="harvests" element={<HarvestsPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="seasons" element={<PastSeasonsPage />} />
          <Route path="seasons/:seasonId" element={<SeasonDetailPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
