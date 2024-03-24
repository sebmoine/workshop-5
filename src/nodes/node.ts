import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";
import { delay } from "../utils";


export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let state : NodeState = {killed:false, x:initialValue, decided:false, k:0}

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    }
    else {
      res.status(200).send("live");
    }
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  function handleProposal(k: number, x: Value) {
    if (!proposals.has(k)) {
      proposals.set(k, []);
    }
    proposals.get(k)!.push(x);
  
    if (proposals.get(k)!.length >= (N - F)) {
      const count0 = proposals.get(k)!.filter(el => el === 0).length;
      const count1 = proposals.get(k)!.filter(el => el === 1).length;
  
      const consensus = count0 > (N / 2) ? 0 : (count1 > (N / 2) ? 1 : "?");
  
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ k: k, x: consensus, messageType: "vote" })
        });
      }
    }
  }
  
  function handleVote(k: number, x: Value) {
    if (!votes.has(k)) {
      votes.set(k, []);
    }
    votes.get(k)!.push(x);
  
    if (votes.get(k)!.length >= (N - F)) {
      const count0 = votes.get(k)!.filter(el => el === 0).length;
      const count1 = votes.get(k)!.filter(el => el === 1).length;
  
      if (count0 >= F + 1) {
        state.x = 0;
        state.decided = true;
      } else if (count1 >= F + 1) {
        state.x = 1;
        state.decided = true;
      } else {
        if (count0 + count1 > 0 && count0 > count1) {
          state.x = 0;
        } else if (count0 + count1 > 0 && count0 < count1) {
          state.x = 1;
        } else {
          state.x = Math.random() > 0.5 ? 0 : 1;
        }
        state.k = k + 1;
  
        for (let i = 0; i < N; i++) {
          fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ k: state.k, x: state.x, messageType: "propose" })
          });
        }
      }
    }
  }

  node.post("/message", async (req, res) => {
    if (isFaulty || state.killed) {
      res.status(400).send("Node is faulty or killed");
      return;
    }
    const { k, x, messageType } = req.body;
    
    if (messageType === "propose") {
      handleProposal(k, x);
    } else if (messageType === "vote") {
      handleVote(k, x);
    }
    res.status(200).send("Message received and processed.");
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(100);
    }
    if (!isFaulty) {
      state.x = initialValue;
      state.decided = false;
      state.k = 1;
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            x: state.x,
            k: state.k,
            messageType: "propose",
          }),
        });
      }
      res.status(200).send("success");
    }
    else {
      state.killed = false,
      state.decided = null;
      state.x = null;
      state.k = null;
      res.status(500).send("The node is faulty.");
    }
  });


  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    state.killed = true;
    state.x = null;
    state.decided = null;
    state.k = 0;
    res.send("The node is stopped.");
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    res.send(state); //res.json
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );
    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
