import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { RoleGate } from '../src/components/RoleGate.tsx';
import { RoleContext } from '../src/lib/role.tsx';

function render(current: 'driver' | 'shop' | null, need: 'driver' | 'shop') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RoleContext.Provider value={{ role: current, setRole: () => {} }}>
        <RoleGate role={need}>
          <p>SECRET-CONTENT</p>
        </RoleGate>
      </RoleContext.Provider>
    </MemoryRouter>,
  );
}

describe('RoleGate: each section only for its role (prototype stand-in for logins)', () => {
  it('shows the section to its own role', () => {
    assert.ok(render('driver', 'driver').includes('SECRET-CONTENT'));
    assert.ok(render('shop', 'shop').includes('SECRET-CONTENT'));
  });

  it('hides the driver section from shop employees and vice versa', () => {
    const shopOnDriver = render('shop', 'driver');
    assert.ok(!shopOnDriver.includes('SECRET-CONTENT'));
    assert.ok(shopOnDriver.includes('for drivers'));
    const driverOnShop = render('driver', 'shop');
    assert.ok(!driverOnShop.includes('SECRET-CONTENT'));
    assert.ok(driverOnShop.includes('for shop employees'));
  });

  it('asks who you are when no role was chosen', () => {
    const html = render(null, 'shop');
    assert.ok(!html.includes('SECRET-CONTENT'));
    assert.ok(html.includes('Choose who you are'));
  });
});
