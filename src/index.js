import { Router } from 'itty-router'

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

function base64url(str) {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function assembleJwt(claims, secret) {
    let claims_64 = base64url(JSON.stringify(claims));
    let header_64 = base64url(JSON.stringify({ "alg": "HS256", "typ": "JWT" }));
    let preamble = header_64 + "." + claims_64;

    let enc = new TextEncoder;
    let ckey = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [ "sign" ]);
    let sig = await crypto.subtle.sign({ name: "HMAC" }, ckey, enc.encode(preamble));

    let sig_64 = base64url(String.fromCharCode(...new Uint8Array(sig)));
    return preamble + "." + sig_64;
}

router.get("/token", async (request, env, context) => {
    let auth = request.headers.get("Authorization");
    if (auth == null || !auth.startsWith("Bearer ")) {
        throw HttpError("expected a token in the 'Authorization' header", 401);
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
        roles: roles,
        iat: now,
        exp: now + (24 * 60 * 60 * 1000) // 24 hours until expiry.
    };

    let jwt = await assembleJwt(claims, env.HS256_SECRET);
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
