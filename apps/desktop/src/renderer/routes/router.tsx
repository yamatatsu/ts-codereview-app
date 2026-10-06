import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';

import { AppShell } from '../features/app-shell';
import { GraphPage } from '../features/graph/graph-page';
import { ProjectSettingsPage } from '../features/projects/project-settings-page';
import { ProjectsPage } from '../features/projects/projects-page';
import { ReviewPage } from '../features/review/review-page';
import { SettingsPage } from '../features/settings/settings-page';

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ProjectsPage });
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});
export const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/settings',
  component: ProjectSettingsPage,
});
export const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review/$targetKey',
  component: ReviewPage,
});
export const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review/$targetKey/graph',
  component: GraphPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  settingsRoute,
  projectSettingsRoute,
  reviewRoute,
  graphRoute,
]);

export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
