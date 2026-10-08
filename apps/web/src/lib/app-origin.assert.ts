import assert from 'node:assert/strict';
import { appOrigin } from './app-origin';

assert.equal(appOrigin('http://localhost:3000/auth/callback?code=private', 'https://skyclip.example/'), 'https://skyclip.example');
assert.equal(appOrigin('http://localhost:3000/auth/callback', ''), 'http://localhost:3000');
// Retired AWS ALB values must not leak into OAuth redirects.
assert.equal(appOrigin('https://skyclip.app/auth/callback', 'http://hanuman-prod-alb-1485638145.us-east-1.elb.amazonaws.com'), 'https://skyclip.app');
assert.equal(appOrigin('https://skyclip.app/auth/callback', 'https://custom.example.com/'), 'https://custom.example.com');
assert.throws(() => appOrigin('http://internal:3000', 'javascript:alert(1)'));
assert.throws(() => appOrigin('http://internal:3000', 'https://user:password@example.com'));
console.log('Public application origin assertions passed.');
