/**
 * This example shows how to use client.registerWebhook to easily set up webhooks. You can see the valid webhooks here:
 * https://open-wa.github.io/wa-automate-nodejs/enums/AvailableWebhooks.html
 */

//Please see these docs: https://open-wa.github.io/wa-automate-nodejs/classes/client.html#middleware

// import { create, Client, AvailableWebhooks  } from '@open-wa/wa-automate';
import { create, Client, AvailableWebhooks } from '../src/index';

const express = require('express');
const app = express();
app.use(express.json());
const PORT = 8082;

//Create your webhook here: https://webhook.site/
const WEBHOOK_ADDRESS = 'PASTE_WEBHOOK_DOT_SITE_UNIQUE_URL_HERE'

create({ sessionId:'session1'})
  .then(async (client:Client) => {
    app.use(client.middleware());
    Object.keys(AvailableWebhooks).map(eventKey=>client.registerWebhook(AvailableWebhooks[eventKey],WEBHOOK_ADDRESS))
    app.listen(PORT, ()=>console.log(`\n• Listening on port ${PORT}!`));
  })
  .catch(e=>console.log('Error',e.message));