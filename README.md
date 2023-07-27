# GitHub to JSON web token

## Overview

This repository implements a Cloudflare Worker that provides a one-stop shop for creating a JSON web token (JWT) from a GitHub personal access token (PAT).
The JWT includes **ArtifactDB**-related roles based on GitHub teams with the following names:

- `ArtifactDB-admins`, with the all-powerful `admin` role.
- `ArtifactDB-creators`, with the `creator` role to create new projects.
- `ArtifactDB-uploaders`, with the `uploader` role to upload new versions of existing projects.

Check out the [CollaboratorDB](https://github.com/orgs/CollaboratorDB/teams) organization for examples of these teams.
However, any GitHub organization can set up similarly-named teams for use with the **gh2jwt** API.

## Usage

Call the **gh2jwt** API with a valid GitHub PAT in the `Authorization` header and a JSON body containing:

- `orgs`: an array of strings containing the GitHub organizations to query for team membership.
- `to`: a string specifying the intended consumer of the resulting JWT.

```console
$ curl -X POST https://gh2jwt.aaron-lun.workers.dev/token \
>     -H "Authorization: Bearer ghp_XXXX" \
>     -d '{ "orgs": [ "CollaboratorDB" ], "to": "CLIENT_ID_HERE" }' \
>     -H "Content-Type: application/json"
{
    "token": "OUTPUT_TOKEN_HERE",
    "expires_at": "2023-06-10T21:08:19.854Z"
}
```

This returns a JWT in the `token` property along with the expiry time for that JWT (specifically, 24 hours after generation).
The JWT is signed using RS256, and the associated public key is available from [OpenID configuration endpoint](https://gh2jwt.aaron-lun.workers.dev/.well-known/openid-configuration).
Decoding the JWT yields the following claims:

```json
{
  "iss": "https://gh2jwt.aaron-lun.workers.dev",
  "aud": "CLIENT_ID_HERE",
  "azp": "CLIENT_ID_HERE",
  "client_id": "CLIENT_ID_HERE",
  "sub": "ArtifactDB-bot",
  "resource_access": {
    "CollaboratorDB": [
      "roles": [
        "admin",
        "creator",
        "uploader"
      ]
    ]
  },
  "iat": 1686344899854,
  "exp": 1686431299854
}
```

Of particular interest is the `sub`, which contains the GitHub user associated with the PAT;
and `resource_access`, which specifies the roles for this user on CollaboratorDB.

## Further comments

- The PAT must be created with the `read:org` and `read:user` scopes.
  Applications can facilitate this process by using GitHub's [OAuth workflow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
- Some client-side caching may be desirable due to [rate limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api?apiVersion=2022-11-28#rate-limiting) on GitHub API requests.
