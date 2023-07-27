import { Router } from 'itty-router';
import * as jose from 'jose';

const api = "https://api.github.com";
const user_agent = "Aaron's gh2jwt Cloudflare worker";

// Create a new router
const router = Router();

export class HttpError extends Error {
    constructor(message, code) {
        super(message);
        this.statusCode = code;
    }
}

router.get("/.well-known/openid-configuration", async (request, env, context) => {
    let base = request.url.replace(/\/\.well-known\/openid-configuration/, "");
    let resp = {
        "issuer": base,
        "jwks_uri": base + "/.well-known/jwks.json",
        "token_endpoint": base + "/token",
        "authorization_endpoint": "https://google.com" // dunno why we need this, but need to avoid some issue on ArtifactDB's side.
    };

    return new Response(
        JSON.stringify(resp, null, 4), 
        { 
            status: 200, 
            "Content-Type": "application/json" 
        }
    );
})

router.get("/.well-known/jwks.json", async (request, env, context) => {
    return new Response(
        env.PUBLIC_KEY,
        { 
            status: 200, 
            "Content-Type": "application/json" 
        }
    );
})

router.post("/token", async (request, env, context) => {
    let auth = request.headers.get("Authorization");
    if (auth == null || !auth.startsWith("Bearer ")) {
        throw new HttpError("expected a token in the 'Authorization' header", 401);
    }

    // Fetch the requested orgs.
    let body;
    try {
        body = await request.json();
    } catch (err) {
        throw new HttpError("could not parse JSON request", 400);
    }

    if (!("orgs" in body)) {
        throw new HttpError("expected 'orgs' property in the request body", 400);
    }
    let orgs = body.orgs;

    if (!(orgs instanceof Array)) {
        throw new HttpError("expected 'orgs' array in the request body", 400);
    }
    for (const x of orgs) {
        if (typeof x !== "string") {
            throw new HttpError("expected 'orgs' to be an array of strings in the request body", 400);
        }
    }

    // Fetch the intended audience.
    if (typeof body.to !== "string") {
        throw new HttpError("expected 'to' to be a string in the request body", 400);
    }

    let token = auth.slice(7);
    let headers = {
        "Authorization": "Bearer " + token,
        "User-Agent": user_agent
    };

    // Identify the user and the teams to which they belong.
    let requests = [ fetch(api + "/user", { headers }) ];
    for (const x of orgs) {
        requests.push(fetch(api + "/orgs/" + x + "/teams", { headers }));
    }
    let responses = await Promise.all(requests);

    let resp_self = responses[0];
    if (!resp_self.ok) {
        throw new HttpError("failed to identify the GitHub user", 403);
    }
    let body_self = await resp_self.json();
    let user_name = body_self.login;

    let all_roles = {};
    for (var o = 0; o < orgs.length; ++o) {
        let resp_teams = responses[o + 1];
        let roles = [];
        all_roles[orgs[o]] = { roles: roles };

        if (resp_teams.ok) {
            let check = [];
            let preroles = [];

            let body_teams = await resp_teams.json();
            for (const x of body_teams) {
                if (x.name.match(/^ArtifactDB-.*s$/)) {
                    preroles.push(x.name.replace(/^ArtifactDB-/, "").replace(/s$/, ""));
                    let target = x.members_url.replace(/{\/member}$/, "/" + user_name);
                    check.push(fetch(target, { headers }));
                }
            }

            let resolved = await Promise.all(check);
            for (var i = 0; i < resolved.length; ++i) {
                if (resolved[i].ok) {
                    roles.push(preroles[i]);
                }
            }
        }
    }

    let now = Date.now();
    let claims = {
        iss: request.url.replace(/\/token/, ""),
        aud: body.to,
        azp: body.to,
        client_id: body.to,
        sub: user_name,
        preferred_username: user_name,
        resource_access: all_roles,
        jti: crypto.randomUUID(),
        iat: now,
        exp: now + (24 * 60 * 60 * 1000) // 24 hours until expiry.
    };

    const alg = "RS256";
    const privateKey = await jose.importPKCS8(env.PRIVATE_KEY, alg);
    const public_key = (env.PUBLIC_KEY ? JSON.parse(env.PUBLIC_KEY) : { keys: [ { kid: "" } ] }); // TODO: can we get this created at launch time?

    const jwt = await new jose.SignJWT(claims)
      .setProtectedHeader({ alg, typ: "JWT", kid: public_key.keys[0].kid })
      .sign(privateKey);

    let output = { 
        token: jwt,
        expires_at: (new Date(claims.exp)).toISOString()
    };

    return new Response(
        JSON.stringify(output, null, 4), 
        { 
            status: 200, 
            "Content-Type": "application/json" 
        }
    );
});

export default {
    fetch: (request, env, context) => router.handle(request, env, context).catch(e => {
        return new Response(
            JSON.stringify({ "error": e.message }), 
            { 
                status: (e instanceof HttpError ? e.statusCode : 500),
                headers: { "Content-Type": "application/json" }
            }
        );
	})
};
