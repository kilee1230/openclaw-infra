#!/usr/bin/env node
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { CdkGraph, FilterPreset } from "@aws/pdk/cdk-graph";
import { CdkGraphDiagramPlugin } from "@aws/pdk/cdk-graph-plugin-diagram";
import { OpenClawStack } from "../lib/openclaw-stack";
import { env } from "../lib/config";

// Async IIFE required by cdk-graph for diagram generation
(async () => {
  const app = new cdk.App();

  new OpenClawStack(app, "OpenClawStack", {
    env: {
      account: env.AWS_ACCOUNT_ID,
      region: env.AWS_REGION,
    },
    description: "OpenClaw personal deployment — EC2 Spot + S3 + Cloudflare Tunnel",
    tags: {
      Project: "openclaw",
    },
  });

  const graph = new CdkGraph(app, {
    plugins: [
      new CdkGraphDiagramPlugin({
        defaults: {
          theme: "dark",
        },
        diagrams: [
          {
            name: "openclaw-compact",
            title: "OpenClaw Architecture (compact)",
            filterPlan: {
              preset: FilterPreset.COMPACT,
            },
          },
          {
            name: "openclaw-verbose",
            title: "OpenClaw Architecture (verbose)",
            filterPlan: {
              preset: FilterPreset.NONE,
            },
          },
        ],
      }),
    ],
  });

  app.synth();
  await graph.report();
})();
