# GitHub roles for CollaboratorDB

This is a Cloudflare Worker that provides a one-stop shop for extracting CollaboratorDB roles from a GitHub personal access token.
The aim is to mimic the roles that are present in a Keycloak token, based on teams in the [CollaboratorDB](https://github.com/CollaboratorDB) organization:

- [Administrators](https://github.com/orgs/CollaboratorDB/teams/admins), with the all-powerful `admin` role.
- [Creators](https://github.com/orgs/CollaboratorDB/teams/creators), with the `creator` role to create new projects.
- [Uploaders](https://github.com/orgs/CollaboratorDB/teams/uploaders), with the `uploader` role to upload new versions of existing projects.

This functionality assumes that the PAT is created with the `read:org` and `read:user` scopes.

To use, simply call the API with the token in the `Authorization` header:

```console
$ curl -L http://0.0.0.0:8787/user  -H "Authorization: Bearer ghp_XXXX"
{
    "user": "LTLA",
    "roles": [
        "admin",
        "creator",
        "uploader"
    ],
    "expiry": "2023-07-05T00:56:30.000Z"
}
```

This returns the user name, an array of roles, and the expiry time for the token.
