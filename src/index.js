import { Router } from 'itty-router';
import * as jose from 'jose';

const api = "https://api.github.com";
const user_agent = "CollaboratorDB identifier";
const org_name = "CollaboratorDB";

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

    let token = auth.slice(7);
    let headers = {
        "Authorization": "Bearer " + token,
        "User-Agent": user_agent
    };

    // Identify the user and the teams to which they belong.
    let responses = await Promise.all([
        fetch(api + "/user", { headers }),
        fetch(api + "/orgs/" + org_name + "/teams", { headers })
    ]);

    let resp_self = responses[0];
    let resp_teams = responses[1];
    if (!resp_self.ok) {
        throw HttpError("failed to identify the GitHub user", resp_self.statusCode);
    }
    let body_self = await resp_self.json();

    let roles = [];
    if (resp_teams.ok) {
        let check = [];
        let preroles = [];

        let body_teams = await resp_teams.json();
        for (const x of body_teams) {
            if (x.name == "admins" || x.name == "creators" || x.name == "uploaders") {
                preroles.push(x.name.replace(/s$/, ""));
                let target = x.members_url.replace(/{\/member}$/, "/" + body_self.login);
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

    let now = Date.now();
    let claims = {
        iss: "GitHub-roles",
        aud: "CollaboratorDB",
        sub: body_self.login,
        resource_access: {
            CollaboratorDB: roles,
            DemoDB: roles
        },
        iat: now,
        exp: now + (24 * 60 * 60 * 1000) // 24 hours until expiry.
    };

    const alg = "RS256";
    const privateKey = await jose.importPKCS8(env.PRIVATE_KEY, alg);

    const jwt = await new jose.SignJWT(claims)
      .setProtectedHeader({ alg, typ: "JWT" })
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
