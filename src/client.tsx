import {TodoStore} from './client/store';
import {UIController} from './client/controller';
import {installIntegration} from './client/dsh/integration';
import {installStyles} from './client/styles';
import {UpdateStore} from './client/updates';
export const inject=['slots','sessions','uiWorkspace','layout'];
export function apply(ctx:Parameters<typeof installIntegration>[0]){
  const store=new TodoStore();const controller=new UIController();
  const updates=new UpdateStore(store);
  ctx.effect(installStyles,'dsh-followup: scoped styles');
  ctx.effect(()=>{store.start();updates.start();return()=>{updates.dispose();store.dispose();controller.dispose();};},'dsh-followup: client lifetime');
  installIntegration(ctx,store,controller,updates);
}
