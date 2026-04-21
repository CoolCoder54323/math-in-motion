import { StudioNavClient, ProtectedRouteClient } from "./client-components";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRouteClient>
      <div className="flex h-screen flex-col overflow-hidden">
        <StudioNavClient />
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </ProtectedRouteClient>
  );
}
