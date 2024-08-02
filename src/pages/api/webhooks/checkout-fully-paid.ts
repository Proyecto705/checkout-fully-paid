import { gql } from "urql";
import { SaleorAsyncWebhook } from "@saleor/app-sdk/handlers/next";
import { saleorApp } from "../../../saleor-app";
import { createClient } from "../../../lib/create-graphq-client";
import { CheckoutCompleteDocument, CheckoutFullyPaidWebhookPayloadFragment } from "../../../../generated/graphql";
import { NextApiHandler } from "next";


const CheckoutComplete = gql`
  mutation CheckoutComplete($checkoutId: ID!) {
    checkoutComplete(id: $checkoutId) {
      order {
        id
        errors {
          field
          message
          code
        }
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

/**
 * Example payload of the webhook. It will be transformed with graphql-codegen to Typescript type: OrderCreatedWebhookPayloadFragment
 */
const CheckoutFullyPaidWebhookPayload = gql`
  fragment CheckoutFullyPaidWebhookPayload on CheckoutFullyPaid {
    checkout {
      id
    }
  }
`;

/**
 * Top-level webhook subscription query, that will be attached to the Manifest.
 * Saleor will use it to register webhook.
 */
const CheckoutFullyPaidGraphqlSubscription = gql`
  # Payload fragment must be included in the root query
  ${CheckoutFullyPaidWebhookPayload}
  subscription CheckoutFullyPaid {
    event {
      ...CheckoutFullyPaidWebhookPayload
    }
  }
`;

/**
 * Create abstract Webhook. It decorates handler and performs security checks under the hood.
 *
 * orderCreatedWebhook.getWebhookManifest() must be called in api/manifest too!
 */
export const checkoutFullyPaidWebhook = new SaleorAsyncWebhook<CheckoutFullyPaidWebhookPayloadFragment>({
  name: "Checkout Fully Paid in Saleor",
  webhookPath: "api/webhooks/checkout-fully-paid",
  event: "CHECKOUT_FULLY_PAID",
  apl: saleorApp.apl,
  query: CheckoutFullyPaidGraphqlSubscription,
});

const checkoutFullyPaidHandler: NextApiHandler = async (req, res) => {
  let domain = new URL(process.env.NEXT_PUBLIC_SALEOR_HOST_URL || "");
  req.headers["saleor-domain"] = `${domain.host}`;
  req.headers["x-saleor-domain"] = `${domain.host}`;

  const saleorApiUrl = process.env.NEXT_PUBLIC_SALEOR_HOST_URL + "/graphql/";
  req.headers["saleor-api-url"] = saleorApiUrl;

  return checkoutFullyPaidWebhook.createHandler(async (req, res, ctx) => {
    console.log("Checkout Fully Paid webhook received");

    const { payload, authData, event } = ctx;

    const checkoutId = payload.checkout?.id || '';

    const client = createClient(authData.saleorApiUrl, async () => ({
      token: authData.token,
    }));

    try {

      const order = await client.mutation(CheckoutCompleteDocument, {
        checkoutId: checkoutId,
      });

      if (order.data?.checkoutComplete?.errors && order.data?.checkoutComplete?.errors.length > 0 ) {
        console.log(order.data?.checkoutComplete?.errors);
        return res.status(500).json({ message: order.data?.checkoutComplete?.errors[0].message });
      }
      
    } catch (err) {
      console.log({ err });
    }

    console.log('Event handled')
    return res.status(200).json({ message: "event handled" });
  })(req, res);
};

export default checkoutFullyPaidHandler;

/**
 * Disable body parser for this endpoint, so signature can be verified
 */
export const config = {
  api: {
    bodyParser: false,
  },
};
