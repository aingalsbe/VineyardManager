import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ActivitiesPage } from "@/pages/ActivitiesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { RowsPage } from "@/pages/RowsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { TasksPage } from "@/pages/TasksPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="rows" element={<RowsPage />} />
        <Route path="blocks" element={<Navigate to="/rows" replace />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
