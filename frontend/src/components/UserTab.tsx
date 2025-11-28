import { GrantsTable } from "./GrantsTable";

export function UserTab() {
  // User tab simply reuses GrantsTable without admin controls.
  return (
    <div>
      <GrantsTable />
    </div>
  );
}


