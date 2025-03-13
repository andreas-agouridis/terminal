import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Resource } from "sst";

export namespace Email {
  export const Client = new SESv2Client({});

  export async function send(
    from: string,
    to: string,
    subject: string,
    body: string,
    cc?: string,
  ) {
    from = from + "@" + Resource.ShortDomainEmail.sender;
    console.log("sending email", subject, from, to);
    await Client.send(
      new SendEmailCommand({
        Destination: {
          ToAddresses: [to],
          CcAddresses: cc ? [cc] : [],
        },
        Content: {
          Simple: {
            Body: {
              Text: {
                Data: body,
              },
            },
            Subject: {
              Data: subject,
            },
          },
        },
        FromEmailAddress: `Terminal <${from}>`,
      }),
    );
  }
}
