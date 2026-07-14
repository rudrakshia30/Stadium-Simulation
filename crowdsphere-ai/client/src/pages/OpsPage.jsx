/**
 * Operations Page — login gate + main OCC interface.
 */
import { useAuth } from '../context/AuthContext.jsx';
import OpsLogin from '../components/ops/OpsLogin.jsx';
import OpsCommandCentre from '../components/ops/OpsCommandCentre.jsx';

export default function OpsPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div
      id="panel-ops"
      role="tabpanel"
      aria-labelledby="tab-ops"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {isAuthenticated ? <OpsCommandCentre /> : <OpsLogin />}
    </div>
  );
}
