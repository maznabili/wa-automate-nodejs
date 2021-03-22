const meow = require('meow');
const wa = require('../dist');
const { create, generatePostmanJson, ev } = wa;
const path = require('path');
const express = require('express');
const app = express();
const fs = require('fs');
const uuidAPIKey = require('uuid-apikey');
const p2s = require('postman-2-swagger');
const swaggerUi = require('swagger-ui-express');
const terminalLink = require('terminal-link');
const isUrl = require('is-url');
const tcpPortUsed = require('tcp-port-used');
const changeCase = require("change-case");
const swStats = require('swagger-stats');    
var robots = require("express-robots-txt");
const extraFlags = {};
const configWithCases = require('./config-schema.json');
const axios = require('axios').default;

configWithCases.map(({ type, key }) => {
	if (key === "popup") type = "number";
	if (key === "viewport") type= "string" ;
	if (key === "stickerServerEndpoint") type = "string";
	extraFlags[key] = {
		type
	}
});
const configParamText = configWithCases.map(o => `      --${o.p}\t\t${o.p.length < 14 ? `\t` : ``}${o.p.length < 6 ? `\t` : ``}${o.description}`).join("\n")

const cli = meow(`
	Usage
	  $ @open-wa/wa-automate

	Options
      --no-api, -n \t\t\tDon't expose the api. This may be useful if you just want to set the webhooks
      --port, -p \t\t\tSet the port for the api. Default to 8002
	  --host, -h \t\t\tSet the hostname for the service. Default: localhost
	  --webhook, -w \t\t\twebhook to use for the listeners
	  --ev, -e \t\t\tSend launch events to this URL (includes runtime events if eventMode is on). Please only set this flag if you completely understand the consequences of transferring ultra sensitive launch events over webhook!
	  --allow-session-data-webhook, -x \t\tBy default, if you set -e flag, the session data is not transferred to the webhook as it is extremely sensitive data. In order to bypass this security measure, use this flag.
      --key, -k \t\t\tspecify an api key to use as a check for all requests. If you add -k by itself, a key will be autogenerated for you.
      --config, -c \t\t\tThe relative json file that contains the config. By default the system will look for config.json which will override any config variables set. Default: './config.json'
      --session, -s \t\t\tA base64 string representing the session data.
      --keep-alive, -a \t\tIf set, the system will force the session to refocus in this process. This will prevent you from opening a session elsewhere.
      --use-session-id-in-path, -i \tIf set, all API paths will include the session id. default to false and the default session Id is 'session'.
      --generate-api-docs, -d \t\tGenerate postman collection and expose api docs to open in browser.
      --session-data-only, -o \t\tKill the process when the session data is saved.
      --license-key, -l \t\t\tThe license key you want to use for this server. License keys are used to unlock features. Learn more here https://github.com/open-wa/wa-automate-nodejs#license-key
${configParamText}
	  --skip-save-postman-collection \t\t\tDon't save the postman collection.
	  --in-docker \t\t\tGrab config options from the environment variables
	  --headful \t\t\tShows the browser window on your machine
	  --pre-auth-docs \t\t\tPre authenticate documentation site. [High security risk]
	  --api-host \t\t\tThe easy API may be sitting behind a reverse proxy. In this case set --api-host in order to make sure the api docs and api explorer are working properly. You will need to include the protocol as well.
	  --stats \t\t\tExposes API statistics for this specific session

	Please check here for more information on some of the above mentioned parameters: https://open-wa.github.io/wa-automate-nodejs/interfaces/configobject.html

	Examples
	  $ open-wa -p 8080 --disable-spins -a
	  
`, {
	flags: {
		port: {
			type: 'number',
			alias: 'p',
			default: 8002
		},
		ev: {
			type: 'string',
			alias: 'e'
		},
		allowSessionDataWebhook: {
			type: 'boolean',
			alias: 'x',
			default: false
		},
		host: {
			type: 'string',
			alias: 'h',
			default: 'localhost'
		},
		apiHost: {
			type: 'string',
		},
		webhook: {
			type: 'string',
			alias: 'w'
		},
		key: {
			type: 'string',
			alias: 'k'
		},
		config: {
			type: 'string',
			alias: 'c'
		},
		session: {
			type: 'string',
			alias: 's'
		},
		noApi: {
			type: 'boolean',
			alias: 'n',
			default: false
		},
		licenseKey: {
			type: 'string',
			alias: 'l'
		},
		keepAlive: {
			type: 'boolean',
			alias: 'a'
		},
		useSessionIdInPath: {
			type: 'boolean',
			alias: 'i'
		},
		generateApiDocs: {
			type: 'boolean',
			alias: 'd',
			default: true
		},
		sessionDataOnly: {
			type: 'boolean',
			alias: 'o',
			default: false
		},
		inDocker: {
			type: 'boolean',
			default: false
		},
		skipSavePostmanCollection: {
			type: 'boolean',
			default: false
		},
		...extraFlags,
		popup: { 
			type: 'boolean',
			default: false
		},
		headful: { 
			type: 'boolean',
			default: false
		},
		preAuthDocs: { 
			type: 'boolean',
			default: false
		},
		stats: { 
			type: 'boolean',
			default: false
		},
		popupPort: {
		type: 'number',
		}
	},
	booleanDefault: undefined
});

app.use(express.json({ limit: '200mb' })) //add the limit option so we can send base64 data through the api
/**
 * Parse CLI flags from process.env
 */
const envArgs = {};
Object.entries(process.env).filter(([k,v])=>k.includes('WA')).map(([k,v])=>envArgs[changeCase.camelCase(k.replace('WA_',''))]=(v=='false' || v=='FALSE')?false:(v=='true' ||v=='TRUE')?true:Number(v)||v);

const c = {
	autoRefresh: true,
	...cli.flags,
	...envArgs
};
const PORT = c.port;
let config = {};
if (c && c.config) {
	//get the config file
	const configJsonPath = path.join(path.resolve(process.cwd()), c.config || `config.json`);
	if (fs.existsSync(configJsonPath)) {
		try {
			config = JSON.parse(fs.readFileSync(configJsonPath));
		} catch (error) {
			throw `Unable to parse config file as JSON. Please make sure ${configJsonPath} is a valid JSON config file`;
		}
	} else throw `config not found at ${configJsonPath}`;
} else {
	config = {
		...c
	};
}

if (c && c.session) {
	c.sessionData = c.session;
}

if (c && (c.licenseKey || c.l)) {
	config = {
		...config,
		licenseKey: c.licenseKey || c.l
	}
}

if(c && c.popup) {
	config = {
		...config,
		popup: PORT
	}
}

if (!(c.key == null) && c.key == "") {
	//generate the key
	c.key = uuidAPIKey.create().apiKey;
}

if(c.viewport && c.viewport.split && c.viewport.split('x').length && c.viewport.split('x').length==2 && c.viewport.split('x').map(Number).map(n=>!!n?n:null).filter(n=>n).length==2){
	const [width, height] = c.viewport.split('x').map(Number).map(n=>!!n?n:null).filter(n=>n);
	config.viewport = {width, height}
}

if(c.resizable){
	config.defaultViewport= null // <= set this to have viewport emulation off
}

if(c.sessionDataOnly){
	ev.on(`sessionData.**`, async (sessionData, sessionId) =>{
		fs.writeFile(`${sessionId}.data.json`, JSON.stringify(sessionData), (err) => {
			if (err) { console.error(err); return; }
			else 
			console.log(`Session data saved: ${sessionId}.data.json\nClosing.`);
			process.exit();
		  });
	  })
}

if(c.webhook || c.webhook == '') {
	if(c.webhook == '') c.webhook = 'webhooks.json';
			let relativePath = path.join(path.resolve(process.cwd(),c.webhook|| ''));
			if(fs.existsSync(c.webhook) || fs.existsSync(relativePath)) {
				let wh = JSON.parse(fs.readFileSync(fs.existsSync(c.webhook)  ? c.webhook : relativePath, 'utf8'));
				if(wh && Array.isArray(wh)) c.webhook = wh;
				else c.webhook = undefined
			} else if(!isUrl(c.webhook)) {
				c.webhook = undefined
			}

}

if(c.apiHost) {
	c.apiHost = c.apiHost.replace(/\/$/, '')
}

async function start(){
    try {
        const {status, data} = await axios.post(`http://localhost:${PORT}/getConnectionState`);
        if(status===200 && data.response==="CONNECTED"){
            const {data: {response: {sessionId, port, webhook, apiHost}}} = await axios.post(`http://localhost:${PORT}/getConfig`);
            if(config && config.sessionId == sessionId && config.port === port && config.webhook===webhook && config.apiHost===apiHost){
				console.log('removing popup flag')
                if(config.popup) {
                    delete config.popup;
                }
            }
        }
    } catch (error) {
        if(error.code==="ECONNREFUSED") console.log('fresh run')
	}
	config.headless= config.headless && (config.headless === true || config.headless === false || config.headless === "true" || config.headless === "false") ? config.headless : !c.headful
	if(c.ev || c.ev == "") {
		if(!isUrl(c.ev)) console.log("--ev/-e expecting URL - invalid URL.")
		else ev.on('**', async (data,sessionId,namespace) => {
			if(!c.allowSessionDataWebhook && (namespace=="sessionData" || namespace=="sessionDataBase64")) return;
			await axios({
				method: 'post',
				url: c.ev,
				data: {
				ts: Date.now(),
				data,
				sessionId,
				namespace
				}
			});
		})
	}
return await create({ ...config })
.then(async (client) => {
	let swCol = null;
	let pmCol = null;

	app.use(robots({ UserAgent: '*', Disallow: '/' }))
	if (c && c.webhook) {
		if(Array.isArray(c.webhook)) {
			await Promise.all(c.webhook.map(webhook=>{
				if(webhook.url && webhook.events) return client.registerWebhook(webhook.url,webhook.events, webhook.requestConfig || {})
			}))
		} else await client.registerWebhook(c.webhook,"all")
	}

	if(c && c.keepAlive) client.onStateChanged(async state=>{
		if(state==="CONFLICT" || state==="UNLAUNCHED") await client.forceRefocus();
    });

	if (!(c && c.noApi)) {
		if(c && c.key) {
			console.log(`Please use the following api key for requests as a header:\napi_key: ${c.key}`)
			app.use((req, res, next) => {
				if(req.path==='/' && req.method==='GET') return res.redirect('/api-docs/');
				if(req.path.startsWith('/api-docs') || req.path.startsWith('/swagger-stats')) {
					return next();
				}
				const apiKey = req.get('key') || req.get('api_key')
				if (!apiKey || apiKey !== c.key) {
				  res.status(401).json({error: 'unauthorised'})
				} else {
				  next()
				}
			  })
		}

		if(!c.sessionId) c.sessionId = 'session';

		if(c && (c.generateApiDocs || c.stats)) {
			console.log('Generating Swagger Spec');
			pmCol = await generatePostmanJson({
				...c,
				...config
			});
			console.log(`Postman collection generated: open-wa-${c.sessionId}.postman_collection.json`);
			swCol = p2s.default(pmCol);
			/**
			 * Fix swagger docs by removing the content type as a required paramater
			 */
			Object.keys(swCol.paths).forEach(p => {
				let path = swCol.paths[p].post;
				if(c.key) swCol.paths[p].post.security = [
					{
						"api_key": []
					}
				]
				swCol.paths[p].post.externalDocs= {
					"description": "Documentation",
					"url": swCol.paths[p].post.documentationUrl
				  }
				  swCol.paths[p].post.requestBody = {
					  "description": path.summary,
					  "content": {
						"application/json": {
							"schema": {
								"type": "object"
							},
							example:  path.parameters[1].example
						}
					  }
				  };
				  delete path.parameters
			});
			delete swCol.swagger
			swCol.openapi="3.0.3"
			swCol.externalDocs = {
				"description": "Find more info here",
				"url": "https://http://openwa.dev/"
			  }
			  if(c.key) {
				swCol.components = {
				  "securitySchemes": {
					  "api_key": {
						"type": "apiKey",
						"name": "api_key",
						"in": "header"
					  }
				  }
				}
			  swCol.security = [
				  {
					  "api_key": []
				  }
			  ]
			  }
			  //Sort alphabetically
			var x = {}; Object.keys(swCol.paths).sort().map(k=>x[k]=swCol.paths[k]);swCol.paths=x;
			fs.writeFileSync("./open-wa-" + c.sessionId + ".sw_col.json", JSON.stringify(swCol));
			app.get('/postman.json', (req,res)=>res.send(pmCol))
			app.get('/swagger.json', (req,res)=>res.send(swCol))
		}

		if(c && c.generateApiDocs && swCol) {
			console.log('Setting Up API Explorer');
			const swOptions = {
				customCss: '.opblock-description { white-space: pre-line }'
			}
			if(c.key && c.preAuthDocs) {
				swOptions.swaggerOptions = {
					authAction: {
						api_key: {
							name: "api_key",
							schema: {type: "apiKey", in: "header", name: "Authorization", description: ""},
							value: c.key
						}
					}
				}
			}
			app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swCol, swOptions));
		}

		if(c && c.stats && swCol) {
			console.log('Setting Up API Stats');
			app.use(swStats.getMiddleware({
			  elasticsearch:process.env.elastic_url,
			  elasticsearchUsername:process.env.elastic_un,
			  elasticsearchPassword:process.env.elastic_pw,
			  swaggerSpec:swCol,
			  authentication: !!c.key,
			  swaggerOnly: true,
			  onResponseFinish: function(req,res,rrr){
				['file', 'base64', 'image', 'webpBase64', 'base64', 'durl', 'thumbnail'].forEach(key => {
					if(req.body.args[key])
					req.body.args[key] = rrr.http.request.body.args[key] = req.body.args[key].slice(0,25) || 'EMPTY'
				});
				if(rrr.http.response.code!==200 && rrr.http.response.code!==404) {
				  rrr.http.response.phrase = res.statusMessage
				}
			  },
			  onAuthenticate: function(req,username,password){
				return((username==="admin") && (password===c.key));
			  }
			}));
		}
		
		app.use(client.middleware((c && c.useSessionIdInPath)));
		if(process.send){
			process.send('ready');
			process.send('ready');
			process.send('ready');
		}
		console.log(`Checking if port ${PORT} is free`);
		await tcpPortUsed.waitUntilFree(PORT, 200, 20000)
		console.log(`Port ${PORT} is now free.`);
		app.listen(PORT, () => {
			console.log(`\n• Listening on port ${PORT}!`);
			if(process.send){
				process.send('ready');
				process.send('ready');
				process.send('ready');
			}
		});
		const apiDocsUrl = c.apiHost ? `${c.apiHost}/api-docs/ `: `${c.host.includes('http') ? '' : 'http://'}${c.host}:${PORT}/api-docs/ `;
		const link = terminalLink('API Explorer', apiDocsUrl);
		if(c && c.generateApiDocs)  console.log(`\n\t${link}`)

		if(c && c.generateApiDocs && c.stats) {
			const swaggerStatsUrl = c.apiHost ? `${c.apiHost}/api-docs/ `: `${c.host.includes('http') ? '' : 'http://'}${c.host}:${PORT}/swagger-stats/ui `;
			const statsLink = terminalLink('API Stats', swaggerStatsUrl);
			console.log(`\n\t${statsLink}`)
		}

	}
})
.catch(e => console.log('Error', e.message, e));
}

start();