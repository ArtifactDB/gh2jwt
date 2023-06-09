# GitHub roles for CollaboratorDB

This is a Cloudflare Worker that provides a one-stop shop for extracting CollaboratorDB roles from a GitHub personal access token (PAT).
The aim is to mimic the roles that are present in a Keycloak token, based on teams in the [CollaboratorDB](https://github.com/CollaboratorDB) organization:

- [Administrators](https://github.com/orgs/CollaboratorDB/teams/admins), with the all-powerful `admin` role.
- [Creators](https://github.com/orgs/CollaboratorDB/teams/creators), with the `creator` role to create new projects.
- [Uploaders](https://github.com/orgs/CollaboratorDB/teams/uploaders), with the `uploader` role to upload new versions of existing projects.

To use, simply call the API with the GitHub PAT in the `Authorization` header:

```console
$ URL=https://collaboratordb-gh-roles.aaron-lun.workers.dev/token
$ curl -L ${URL} -H "Authorization: Bearer ghp_XXXX"
{
    "token": "OUTPUT_TOKEN_HERE",
    "expires_at": "2023-06-10T21:08:19.854Z"
}
```

This returns a JSON web token (JWT) in the `token` property along with the expiry time for that JWT (specifically, 24 hours after generation).
The JWT is signed using RS256, and the associated public key is available from [OpenID configuration endpoint](https://collaboratordb-gh-roles.aaron-lun.workers.dev/.well-known/openid-configuration).
Decoding the JWT yields the following claims:

```json
{
  "iss": "GitHub-roles",
  "aud": "CollaboratorDB",
  "sub": "ArtifactDB-bot",
  "roles": [
    "admin"
  ],
  "iat": 1686344899854,
  "exp": 1686431299854
}
```

Of particular interest is the `sub`, which contains the GitHub user associated with the PAT;
and `roles`, which specifies the roles for this user on CollaboratorDB.

**Important:**

- The PAT must be created with the `read:org` and `read:user` scopes.
- Some client-side caching may be desirable due to [rate limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api?apiVersion=2022-11-28#rate-limiting) on GitHub API requests.
