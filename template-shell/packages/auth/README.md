# @gears-frontx/auth

Headless authentication contract for Gears FrontX.

This package only defines types and the `AuthProvider` contract. It does not ship UI, routing, or network interception logic.

## AuthProvider

Minimal required surface:

- `getSession()`
- `checkAuth()`
- `logout()`

Optional surface:

- `login()`, `handleCallback()`, `refresh()`
- `getIdentity()`, `getPermissions()`, `canAccess()`

## Gears FrontX Integration

Use the framework `auth()` plugin to bind your `AuthProvider` into `@gears-frontx/api` REST requests (bearer tokens and cookie-session).

```ts
import { createFrontX } from '@gears-frontx/framework';
import { auth } from '@gears-frontx/framework';
import type { AuthProvider } from '@gears-frontx/auth';

const provider: AuthProvider = {
  async getSession() {
    return { kind: 'cookie' };
  },
  async checkAuth() {
    return { authenticated: true };
  },
  async logout() {
    return { type: 'none' };
  },
};

const app = createFrontX()
  .use(auth({ provider }))
  .build();
```

The plugin sends credentials only to the app's own origin and to the origins you list, so list your API's origin when it is not the app's own. For the cookie provider above, that list is `allowedCookieOrigins`, and its origins also get the CSRF header:

```ts
auth({
  provider,
  frontxApi: { allowedCookieOrigins: ['https://api.example.com'] },
});
```

A provider that returns `{ kind: 'bearer', token }` lists the origin in `frontxApi.allowedBearerOrigins` instead. The two lists are separate: a cookie origin gets no token, and a bearer origin gets no cookies. A 401 from an origin in neither list does not refresh the session.

One limit holds until [constructorfabric/gears-frontx#770](https://github.com/constructorfabric/gears-frontx/issues/770) is fixed. The plugin checks the URL that `@gears-frontx/api` shows it, which joins the service's `baseURL` and the path. Axios skips the `baseURL` when the path is absolute (`https://…`) or protocol-relative (`//…`). So on a service with a `baseURL`, `get('https://other.example/x')` is checked as a path under the `baseURL`, but it goes to `other.example`, with the credentials. Pass only relative paths to a service with a `baseURL`. To call another origin, give it a service whose `baseURL` is that origin.

## Local Development (Using A Local Gears FrontX Checkout)

If you are testing changes made locally in the Gears FrontX monorepo, you can install the packages into a separate consumer app via `file:` dependencies.

1. Build packages in the Gears FrontX repo first (exports point to `dist/`):

```bash
cd /path/to/frontx
npm run build:packages:sdk
npm run build:packages:framework
```

2. Point your consumer app dependencies to the local folders:

```json
{
  "dependencies": {
    "@gears-frontx/auth": "file:/path/to/frontx/packages/auth",
    "@gears-frontx/api": "file:/path/to/frontx/packages/api",
    "@gears-frontx/framework": "file:/path/to/frontx/packages/framework"
  }
}
```

If you use pnpm, prefer `link:` for symlinks:

```json
{
  "dependencies": {
    "@gears-frontx/auth": "link:/path/to/frontx/packages/auth",
    "@gears-frontx/api": "link:/path/to/frontx/packages/api",
    "@gears-frontx/framework": "link:/path/to/frontx/packages/framework"
  }
}
```

Note: `@gears-frontx/api` expects `axios` as a peer dependency. Install it in your consumer app:

```bash
pnpm add axios
# or: npm i axios
```

## Manual Node.js Tests

This repo includes manual Node.js scripts for bearer attach, refresh+retry, and abort semantics:

- `scripts/manual-auth-tests/README.md`

Cookie-session is tested as a browser/manual scenario (recommended for UI apps).
