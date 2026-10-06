import { createHashRouter, Navigate } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { NodesPage } from '@/pages/NodesPage'
import { NodeDetailPage } from '@/pages/NodeDetailPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { GroupDetailPage } from '@/pages/GroupDetailPage'
import { SetEditorPage } from '@/pages/SetEditorPage'
import { SpritesPage } from '@/pages/SpritesPage'
import { SpriteEditorPage } from '@/pages/SpriteEditorPage'
import { PresetsPage } from '@/pages/PresetsPage'

// Hash routing: the .NET server only serves static files, with no SPA fallback.
export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/nodes" replace /> },
      { path: 'nodes', element: <NodesPage /> },
      { path: 'nodes/:nodeId', element: <NodeDetailPage /> },
      { path: 'groups', element: <GroupsPage /> },
      { path: 'groups/:groupId', element: <GroupDetailPage /> },
      { path: 'groups/:groupId/sets/:setId', element: <SetEditorPage /> },
      { path: 'sprites', element: <SpritesPage /> },
      { path: 'sprites/:spriteId', element: <SpriteEditorPage /> },
      { path: 'presets', element: <PresetsPage /> },
      { path: '*', element: <Navigate to="/nodes" replace /> },
    ],
  },
])
