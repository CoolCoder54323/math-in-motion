import { StudioNavClient, ProtectedRouteClient } from "./client-components";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRouteClient>
      <div className="flex min-h-screen flex-col">
        <StudioNavClient />
        <main className="flex-1">{children}</main>
      </div>
    </ProtectedRouteClient>
  );
}
