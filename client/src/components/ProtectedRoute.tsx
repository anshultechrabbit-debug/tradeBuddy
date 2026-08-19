import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './Layout';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchMe } from '../store/authSlice';
import { Spinner } from './ui';

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { user, token, loading } = useAppSelector((s) => s.auth);

  useEffect(() => {
    if (token && !user && !loading) {
      dispatch(fetchMe());
    }
  }, [token, user, loading, dispatch]);

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!user) {
    return (
      <div className="page">
        <Spinner label="Loading session…" />
      </div>
    );
  }
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}