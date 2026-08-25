import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ActivitiesPage } from "@/pages/ActivitiesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { HarvestsPage } from "@/pages/HarvestsPage";
import { LoginPage } from "@/pages/LoginPage";
import { RowsPage } from "@/pages/RowsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { TasksPage } from "@/pages/TasksPage";

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="rows" element={<RowsPage />} />
        <Route path="blocks" element={<Navigate to="/rows" replace />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="harvests" element={<HarvestsPage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
