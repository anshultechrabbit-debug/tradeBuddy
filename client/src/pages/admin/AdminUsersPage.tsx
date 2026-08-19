import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchUsers, createUser, updateUser, deleteUser } from '../../store/adminSlice';
import { Card, Table, Badge, EmptyState, ErrorBox, PaginationBar } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { apiErrorMessage } from '../../api/client';

export function AdminUsersPage() {
  const dispatch = useAppDispatch();
  const { users, error } = useAppSelector((s) => s.admin);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchUsers({ page, limit: 15, search: search || undefined }));
  }, [dispatch, page, search]);

  async function handleCreate(formData: FormData) {
    try {
      await dispatch(
        createUser({
          email: formData.get('email') as string,
          password: formData.get('password') as string,
          fullName: (formData.get('fullName') as string) || undefined,
          role: (formData.get('role') as string) || undefined,
        })
      ).unwrap();
      dispatch(fetchUsers({ page, limit: 15, search: search || undefined }));
    } catch (err) {
      setActionError(apiErrorMessage(err));
    }
  }

  async function toggleStatus(user: { id: number; status: string }) {
    await dispatch(updateUser({ id: user.id, payload: { status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } }));
    dispatch(fetchUsers({ page, limit: 15, search: search || undefined }));
  }

  async function removeUser(id: number) {
    await dispatch(deleteUser(id));
    dispatch(fetchUsers({ page, limit: 15, search: search || undefined }));
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Admin · Users</h1>
      </header>

      {error || actionError ? <ErrorBox message={error ?? actionError} /> : null}

      <div className="grid-2">
        <Card title="Create user">
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate(new FormData(e.currentTarget));
              e.currentTarget.reset();
            }}
          >
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" required minLength={8} />
            </label>
            <label className="field">
              <span>Full name</span>
              <input name="fullName" />
            </label>
            <label className="field">
              <span>Role</span>
              <select name="role" defaultValue="USER">
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">
              Create user
            </button>
          </form>
        </Card>

        <Card title={`Users (${users?.meta.total ?? 0})`}>
          <div className="search-bar">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by email or name…"
            />
          </div>
          {users && users.data.length > 0 ? (
            <>
              <Table headers={['Email', 'Name', 'Role', 'Status', 'Joined', '']}>
                {users.data.map((u) => (
                  <tr key={u.id}>
                    <td className="strong">{u.email}</td>
                    <td>{u.fullName ?? '—'}</td>
                    <td>
                      <Badge className={u.role === 'ADMIN' ? 'badge badge-watch' : 'badge badge-muted'}>{u.role}</Badge>
                    </td>
                    <td>
                      <Badge className={u.status === 'ACTIVE' ? 'badge badge-buy' : 'badge badge-avoid'}>{u.status}</Badge>
                    </td>
                    <td className="muted small">{formatDateTime(u.createdAt)}</td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-outline btn-sm" onClick={() => toggleStatus(u)}>
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => removeUser(u.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
              <PaginationBar page={page} totalPages={users.meta.totalPages} onPage={setPage} />
            </>
          ) : (
            <EmptyState title="No users found" />
          )}
        </Card>
      </div>
    </div>
  );
}