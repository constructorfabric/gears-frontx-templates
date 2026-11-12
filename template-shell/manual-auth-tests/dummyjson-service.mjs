import { BaseApiService, RestProtocol } from '@gears-frontx/api';

/**
 * Not the app's own origin, so `auth()` sends the bearer token here only when it is listed
 * in `frontxApi.allowedBearerOrigins`.
 */
export const DUMMYJSON_ORIGIN = 'https://dummyjson.com';

export class DummyJsonService extends BaseApiService {
  constructor() {
    super({ baseURL: DUMMYJSON_ORIGIN }, new RestProtocol({ timeout: 10_000 }));
  }

  login() {
    return this.protocol(RestProtocol).post('/auth/login', {
      username: 'emilys',
      password: 'emilyspass',
      expiresInMins: 5,
    });
  }

  me(options) {
    return this.protocol(RestProtocol).get('/auth/me', options);
  }
}
