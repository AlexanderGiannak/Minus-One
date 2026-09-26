importScripts('traffic-model.js','miami-data.js');
onmessage = ({data}) => {
  try {
    const result=MiamiTraffic.solve(MIAMI_DATA[data.area],data.closed);
    postMessage({id:data.id,area:data.area,result});
  } catch(error) {postMessage({id:data.id,area:data.area,error:error.message});}
};
