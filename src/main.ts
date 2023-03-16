import CDP from 'chrome-remote-interface';
import HTMLParser from 'node-html-parser';

const client = await CDP();
const { Network, Page } = client;

const awaitPath = `/__await_time.js`;

await Network.setRequestInterception({
    patterns: [
        {
            urlPattern: 'http://127.0.0.1:5500/website/index.html',
            resourceType: 'Document',
            interceptionStage: 'HeadersReceived',
        },
        {
            urlPattern: 'http://127.0.0.1:5500' + awaitPath,
            resourceType: 'Script',
            interceptionStage: 'HeadersReceived',
        },
    ],
});

client['Network.requestIntercepted'](
    async ({ interceptionId, responseHeaders = {}, request }) => {
        responseHeaders = { ...responseHeaders };

        if (request.url.endsWith(awaitPath)) {
            await new Promise((res) => setTimeout(res, 1000));
            Network.continueInterceptedRequest({
                interceptionId,
            });
            return;
        }

        const response = await Network.getResponseBodyForInterception({
            interceptionId,
        });
        const bodyText = response.base64Encoded
            ? Buffer.from(response.body, 'base64').toString('utf-8')
            : response.body;

        const html = HTMLParser.parse(bodyText);

        html.innerHTML = [
            `<script src=${JSON.stringify(awaitPath)}></script>`,
            html.innerHTML,
        ].join('\n');

        const newBodyText = html.toString();
        responseHeaders['Content-Length'] = newBodyText.length.toString();
        const newHeaders = Object.entries(responseHeaders).map(
            ([k, v]) => `${k}:\x20${v}`
        );

        Network.continueInterceptedRequest({
            interceptionId,
            rawResponse: Buffer.from(
                'HTTP/1.1 200 OK' +
                    '\r\n' +
                    newHeaders.join('\r\n') +
                    '\r\n\r\n' +
                    newBodyText
            ).toString('base64'),
        });
        console.log(request.url);
    }
);

await Network.enable({});
await Page.enable();
await Page.navigate({ url: 'http://127.0.0.1:5500/website/index.html' });
await client['Page.loadEventFired']();
