import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { PublicUser } from '../../shared/types.ts';
import { RequireAuth } from '../src/components/RequireAuth.tsx';
import { AuthContext, type AuthState } from '../src/lib/auth.tsx';

const driver: PublicUser = { username: 'driver1', displayName: 'Dana Driver', role: 'driver' };
const employee: PublicUser = { username: 'employee1', displayName: 'Erin Employee', role: 'employee' };

function render(state: AuthState, role: 'driver' | 'employee') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthContext.Provider value={{ ...state, login: async () => {}, logout: async () => {} }}>
        <RequireAuth role={role}>
          <p>PROTECTED-CONTENT</p>
        </RequireAuth>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('RequireAuth: pages only for signed-in accounts of the right role', () => {
  it('shows the page to its own role', () => {
    assert.ok(render({ status: 'signed-in', user: driver }, 'driver').includes('PROTECTED-CONTENT'));
    assert.ok(render({ status: 'signed-in', user: employee }, 'employee').includes('PROTECTED-CONTENT'));
  });

  it('hides driver pages from employees and employee pages from drivers', () => {
    const employeeOnDriver = render({ status: 'signed-in', user: employee }, 'driver');
    assert.ok(!employeeOnDriver.includes('PROTECTED-CONTENT'));
    assert.ok(employeeOnDriver.includes('for drivers'));
    const driverOnEmployee = render({ status: 'signed-in', user: driver }, 'employee');
    assert.ok(!driverOnEmployee.includes('PROTECTED-CONTENT'));
    assert.ok(driverOnEmployee.includes('for shop employees'));
  });

  it('shows nothing protected while checking the session or when signed out', () => {
    assert.ok(!render({ status: 'loading', user: null }, 'driver').includes('PROTECTED-CONTENT'));
    assert.ok(!render({ status: 'signed-out', user: null }, 'driver').includes('PROTECTED-CONTENT'));
  });
});
