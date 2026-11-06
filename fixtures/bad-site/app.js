// Intentionally planted patterns for the secrets scanner (fixture only — not real keys)
// AWS docs publish AKIAIOSFODNN7EXAMPLE as a non-functional example id.
const AWS = "AKIAIOSFODNN7EXAMPLE";
const API_KEY = "bh_fixture_bundle_key_abcdefghijklmnopqrstuv";
const secret = "fixture_bundle_secret_token_xyz9876543210";
console.log("bad fixture bundle", AWS, API_KEY, secret);
